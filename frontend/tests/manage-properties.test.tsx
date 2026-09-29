import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Auth data access so the AuthProvider hydrates to a chosen role.
vi.mock('@/lib/auth', async (orig) => {
  const actual = await orig<typeof import('@/lib/auth')>();
  return { ...actual, fetchCurrentUser: vi.fn(), logoutRequest: vi.fn() };
});
// Mock the landlord property/image data access (no real network).
vi.mock('@/lib/managed-properties', () => ({
  listMyProperties: vi.fn(),
  getMyProperty: vi.fn(),
  createProperty: vi.fn(),
  updateMyProperty: vi.fn(),
  deleteMyProperty: vi.fn(),
  publishMyProperty: vi.fn(),
  unpublishMyProperty: vi.fn(),
  listPropertyImages: vi.fn(),
  uploadPropertyImage: vi.fn(),
  setPrimaryPropertyImage: vi.fn(),
  reorderPropertyImages: vi.fn(),
  deletePropertyImage: vi.fn(),
}));

import * as authApi from '@/lib/auth';
import * as api from '@/lib/managed-properties';
import { AuthProvider } from '@/components/auth/auth-provider';
import { ManagedPropertiesView } from '@/components/manage-properties/managed-properties-view';
import { PropertyCreateView } from '@/components/manage-properties/property-create-view';
import { PropertyEditView } from '@/components/manage-properties/property-edit-view';
import { ManagedPropertyDetailView } from '@/components/manage-properties/managed-property-detail-view';
import { PropertyImageManager } from '@/components/manage-properties/property-image-manager';
import { roleFeatureLinks } from '@/components/account/account-links';
import { ApiRequestError } from '@/lib/api';
import type { AuthUser } from '@/types/auth';
import type { ManagedImage, ManagedProperty } from '@/types/managed-property';

const landlord: AuthUser = {
  id: 'l1',
  role: 'LANDLORD',
  firstName: 'Aline',
  lastName: 'M',
  email: 'aline@example.rw',
  phone: '+250788123456',
  profileImageKey: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};
const tenant: AuthUser = { ...landlord, id: 't1', role: 'TENANT', firstName: 'Jean' };

const property = (over: Partial<ManagedProperty> = {}): ManagedProperty => ({
  id: 'prop-1',
  landlordId: 'l1',
  title: 'Sunny Apartment in Remera',
  description: 'A lovely place',
  propertyType: 'APARTMENT',
  bedrooms: 2,
  bathrooms: 1,
  monthlyRent: 300000,
  securityDeposit: 250000,
  otherCharges: 0,
  currency: 'RWF',
  province: 'Kigali City',
  district: 'Gasabo',
  sector: 'Remera',
  cell: null,
  village: null,
  additionalLocation: null,
  amenities: ['Parking'],
  status: 'AVAILABLE',
  isPublished: false,
  publishedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

const image = (over: Partial<ManagedImage> = {}): ManagedImage => ({
  id: 'img-1',
  url: '/api/v1/properties/prop-1/images/img-1',
  isPrimary: false,
  sortOrder: 0,
  ...over,
});

let replace: ReturnType<typeof vi.fn>;
let push: ReturnType<typeof vi.fn>;

beforeEach(() => {
  replace = vi.fn();
  push = vi.fn();
  vi.mocked(useRouter).mockReturnValue({
    push,
    replace,
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  } as unknown as ReturnType<typeof useRouter>);
  vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(landlord);
  // Nested image manager loads an (empty) gallery by default.
  vi.mocked(api.listPropertyImages).mockResolvedValue([]);
});
afterEach(() => vi.clearAllMocks());

const withProvider = (ui: React.ReactNode) => render(<AuthProvider>{ui}</AuthProvider>);

// ============================================================================
// Navigation exposure (landlord-only)
// ============================================================================
describe('navigation', () => {
  it('exposes "My properties" to landlords only', () => {
    const landlordLinks = roleFeatureLinks('LANDLORD');
    const tenantLinks = roleFeatureLinks('TENANT');
    expect(landlordLinks.some((l) => l.href === '/landlord/properties')).toBe(true);
    expect(tenantLinks.some((l) => l.href === '/landlord/properties')).toBe(false);
  });
});

// ============================================================================
// My Properties list
// ============================================================================
describe('my properties list', () => {
  it('renders the landlord’s properties with publication + availability badges', async () => {
    vi.mocked(api.listMyProperties).mockResolvedValue([property({ isPublished: true })]);
    withProvider(<ManagedPropertiesView />);
    expect(await screen.findByText('Sunny Apartment in Remera')).toBeInTheDocument();
    expect(screen.getByText('Published')).toBeInTheDocument();
    expect(screen.getByText('Available')).toBeInTheDocument();
  });

  it('renders the selected primary image in a property card', async () => {
    vi.mocked(api.listMyProperties).mockResolvedValue([property()]);
    vi.mocked(api.listPropertyImages).mockResolvedValue([
      image({ id: 'secondary', url: '/secondary.jpg', sortOrder: 1 }),
      image({
        id: 'primary',
        url: '/primary.jpg',
        isPrimary: true,
        sortOrder: 0,
      }),
    ]);

    withProvider(<ManagedPropertiesView />);

    const primary = await screen.findByRole('img', {
      name: 'Sunny Apartment in Remera primary image',
    });
    expect(primary).toHaveAttribute('src', expect.stringContaining('/primary.jpg'));
  });

  it('falls back safely when a property has no available images', async () => {
    vi.mocked(api.listMyProperties).mockResolvedValue([property()]);
    vi.mocked(api.listPropertyImages).mockResolvedValue([]);

    withProvider(<ManagedPropertiesView />);

    expect(await screen.findByText('No image available')).toBeInTheDocument();
  });

  it('renders an empty state with an add-property CTA', async () => {
    vi.mocked(api.listMyProperties).mockResolvedValue([]);
    withProvider(<ManagedPropertiesView />);
    expect(await screen.findByText(/no properties yet/i)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /add property/i }).length).toBeGreaterThan(0);
  });

  it('redirects an anonymous visitor to login', async () => {
    vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(null);
    withProvider(<ManagedPropertiesView />);
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(expect.stringContaining('/login?returnTo=')),
    );
    expect(api.listMyProperties).not.toHaveBeenCalled();
  });

  it('blocks a tenant (wrong role) and never loads landlord data', async () => {
    vi.mocked(authApi.fetchCurrentUser).mockResolvedValue(tenant);
    withProvider(<ManagedPropertiesView />);
    expect(await screen.findByText(/available to landlords/i)).toBeInTheDocument();
    expect(api.listMyProperties).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Create
// ============================================================================
describe('create property', () => {
  function fillRequired() {
    fireEvent.change(screen.getByLabelText(/^title/i), {
      target: { value: 'New Home' },
    });
    fireEvent.change(screen.getByLabelText(/property type/i), {
      target: { value: 'HOUSE' },
    });
    fireEvent.change(screen.getByLabelText(/monthly rent/i), {
      target: { value: '200000' },
    });
    fireEvent.change(screen.getByLabelText(/province/i), { target: { value: 'Kigali City' } });
    fireEvent.change(screen.getByLabelText(/district/i), { target: { value: 'Gasabo' } });
    fireEvent.change(screen.getByLabelText(/sector/i), { target: { value: 'Remera' } });
  }

  it('validates required fields before submitting', async () => {
    withProvider(<PropertyCreateView />);
    const submit = await screen.findByRole('button', { name: /create property/i });
    fireEvent.click(submit);
    expect(await screen.findByText(/a title is required/i)).toBeInTheDocument();
    expect(api.createProperty).not.toHaveBeenCalled();
  });

  it('submits ONLY safe editable fields (no server-controlled keys)', async () => {
    vi.mocked(api.createProperty).mockResolvedValue(property({ id: 'prop-9' }));
    withProvider(<PropertyCreateView />);
    await screen.findByRole('button', { name: /create property/i });
    fillRequired();
    fireEvent.click(screen.getByRole('button', { name: /create property/i }));

    await waitFor(() => expect(api.createProperty).toHaveBeenCalled());
    const body = vi.mocked(api.createProperty).mock.calls[0]![0] as unknown as Record<
      string,
      unknown
    >;
    expect(body.title).toBe('New Home');
    expect(body.propertyType).toBe('HOUSE');
    expect(body.monthlyRent).toBe(200000);
    expect(body).toHaveProperty('otherCharges'); // backend field name
    for (const forbidden of [
      'id',
      'landlordId',
      'status',
      'isPublished',
      'publishedAt',
      'currency',
      'createdAt',
      'updatedAt',
      'additionalCharges',
      'villageOrArea',
    ]) {
      expect(body).not.toHaveProperty(forbidden);
    }
    await waitFor(() => expect(push).toHaveBeenCalledWith('/landlord/properties/prop-9'));
  });
});

// ============================================================================
// Edit (changed fields only)
// ============================================================================
describe('edit property', () => {
  it('blocks a no-op save (never issues an empty PATCH)', async () => {
    vi.mocked(api.getMyProperty).mockResolvedValue(property());
    withProvider(<PropertyEditView id="prop-1" />);
    const save = await screen.findByRole('button', { name: /save changes/i });
    fireEvent.click(save);
    expect(await screen.findByText(/no changes to save/i)).toBeInTheDocument();
    expect(api.updateMyProperty).not.toHaveBeenCalled();
  });

  it('PATCHes ONLY the changed field', async () => {
    vi.mocked(api.getMyProperty).mockResolvedValue(property());
    vi.mocked(api.updateMyProperty).mockResolvedValue(property({ title: 'Renamed' }));
    withProvider(<PropertyEditView id="prop-1" />);
    const title = await screen.findByLabelText(/^title/i);
    fireEvent.change(title, { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(api.updateMyProperty).toHaveBeenCalled());
    const [id, patch] = vi.mocked(api.updateMyProperty).mock.calls[0]!;
    expect(id).toBe('prop-1');
    expect(Object.keys(patch)).toEqual(['title']);
    expect(patch.title).toBe('Renamed');
  });
});

// ============================================================================
// Management detail: publish / availability / delete / no payments
// ============================================================================
describe('management detail', () => {
  it('publishes a draft and reflects the new state', async () => {
    vi.mocked(api.getMyProperty).mockResolvedValue(property({ isPublished: false }));
    vi.mocked(api.publishMyProperty).mockResolvedValue(
      property({ isPublished: true, publishedAt: '2026-08-27T00:00:00.000Z' }),
    );
    withProvider(<ManagedPropertyDetailView id="prop-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /^publish/i }));
    await waitFor(() => expect(api.publishMyProperty).toHaveBeenCalledWith('prop-1'));
    expect(await screen.findByText('Published')).toBeInTheDocument();
  });

  it('shows a safe message when publishing an incomplete property', async () => {
    vi.mocked(api.getMyProperty).mockResolvedValue(property({ description: null }));
    vi.mocked(api.publishMyProperty).mockRejectedValue(
      new ApiRequestError('incomplete', 'PROPERTY_INCOMPLETE', 400),
    );
    withProvider(<ManagedPropertyDetailView id="prop-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /^publish/i }));
    expect(await screen.findByText(/add a description/i)).toBeInTheDocument();
    expect(screen.queryByText('Published')).toBeNull();
  });

  it('unpublishes a published property', async () => {
    vi.mocked(api.getMyProperty).mockResolvedValue(property({ isPublished: true }));
    vi.mocked(api.unpublishMyProperty).mockResolvedValue(property({ isPublished: false }));
    withProvider(<ManagedPropertyDetailView id="prop-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /unpublish/i }));
    await waitFor(() => expect(api.unpublishMyProperty).toHaveBeenCalledWith('prop-1'));
  });

  it('treats availability as read-only (no status controls) and separate from publication', async () => {
    vi.mocked(api.getMyProperty).mockResolvedValue(property({ status: 'OCCUPIED' }));
    withProvider(<ManagedPropertyDetailView id="prop-1" />);
    await screen.findByRole('heading', { name: 'Sunny Apartment in Remera' });
    // Availability shown, but no control to change it.
    expect(screen.getByText('Occupied')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: /set (available|occupied|unavailable)|mark as (available|occupied|unavailable)/i,
      }),
    ).toBeNull();
    // Publication and availability are distinct sections.
    expect(screen.getByText('Publication')).toBeInTheDocument();
    expect(screen.getByText('Availability')).toBeInTheDocument();
  });

  it('shows a "view public listing" link only when published', async () => {
    vi.mocked(api.getMyProperty).mockResolvedValue(property({ isPublished: true }));
    withProvider(<ManagedPropertyDetailView id="prop-1" />);
    const link = await screen.findByRole('link', { name: /view public listing/i });
    expect(link).toHaveAttribute('href', '/properties/prop-1');
  });

  it('deletes via confirmation and returns to the list', async () => {
    vi.mocked(api.getMyProperty).mockResolvedValue(property());
    vi.mocked(api.deleteMyProperty).mockResolvedValue(undefined);
    withProvider(<ManagedPropertyDetailView id="prop-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /^delete$/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /delete property/i }));
    await waitFor(() => expect(api.deleteMyProperty).toHaveBeenCalledWith('prop-1'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/landlord/properties'));
  });

  it('maps PROPERTY_CANNOT_BE_DELETED to safe copy', async () => {
    vi.mocked(api.getMyProperty).mockResolvedValue(property());
    vi.mocked(api.deleteMyProperty).mockRejectedValue(
      new ApiRequestError('nope', 'PROPERTY_CANNOT_BE_DELETED', 409),
    );
    withProvider(<ManagedPropertyDetailView id="prop-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /^delete$/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /delete property/i }));
    await waitFor(() => expect(api.deleteMyProperty).toHaveBeenCalled());
    expect(await screen.findByText(/related rental records/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('renders NO payment UI on the management page', async () => {
    vi.mocked(api.getMyProperty).mockResolvedValue(property({ isPublished: true }));
    withProvider(<ManagedPropertyDetailView id="prop-1" />);
    await screen.findByRole('heading', { name: 'Sunny Apartment in Remera' });
    expect(screen.queryByText(/make payment|pay rent|mtn|momo|airtel|payment history/i)).toBeNull();
  });
});

// ============================================================================
// Image manager
// ============================================================================
describe('image manager', () => {
  function fileInput(): HTMLInputElement {
    const input = document.querySelector('input[type="file"]');
    if (!input) throw new Error('file input not found');
    return input as HTMLInputElement;
  }

  it('uploads via the multipart `file` field and refreshes', async () => {
    vi.mocked(api.listPropertyImages).mockResolvedValue([]);
    vi.mocked(api.uploadPropertyImage).mockResolvedValue(image({ isPrimary: true }));
    render(<PropertyImageManager propertyId="prop-1" />);
    await screen.findByText(/no photos yet/i);

    const file = new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' });
    vi.mocked(api.listPropertyImages).mockResolvedValue([image({ isPrimary: true })]);
    fireEvent.change(fileInput(), { target: { files: [file] } });

    await waitFor(() => expect(api.uploadPropertyImage).toHaveBeenCalled());
    const [pid, uploaded] = vi.mocked(api.uploadPropertyImage).mock.calls[0]!;
    expect(pid).toBe('prop-1');
    expect(uploaded).toBeInstanceOf(File);
  });

  it('rejects an unsupported image type client-side (no upload call)', async () => {
    vi.mocked(api.listPropertyImages).mockResolvedValue([]);
    render(<PropertyImageManager propertyId="prop-1" />);
    await screen.findByText(/no photos yet/i);
    const bad = new File(['x'], 'note.txt', { type: 'text/plain' });
    fireEvent.change(fileInput(), { target: { files: [bad] } });
    expect(await screen.findByText(/unsupported image type/i)).toBeInTheDocument();
    expect(api.uploadPropertyImage).not.toHaveBeenCalled();
  });

  it('sets a primary image', async () => {
    vi.mocked(api.listPropertyImages).mockResolvedValue([
      image({ id: 'a', isPrimary: true, sortOrder: 0 }),
      image({ id: 'b', isPrimary: false, sortOrder: 1 }),
    ]);
    vi.mocked(api.setPrimaryPropertyImage).mockResolvedValue([]);
    render(<PropertyImageManager propertyId="prop-1" />);
    const setBtn = await screen.findByRole('button', { name: /set primary/i });
    fireEvent.click(setBtn);
    await waitFor(() => expect(api.setPrimaryPropertyImage).toHaveBeenCalledWith('prop-1', 'b'));
  });

  it('reorders with an imageIds permutation', async () => {
    vi.mocked(api.listPropertyImages).mockResolvedValue([
      image({ id: 'a', sortOrder: 0 }),
      image({ id: 'b', sortOrder: 1 }),
    ]);
    vi.mocked(api.reorderPropertyImages).mockResolvedValue([]);
    render(<PropertyImageManager propertyId="prop-1" />);
    const moveLater = await screen.findByRole('button', { name: /move photo 1 later/i });
    fireEvent.click(moveLater);
    await waitFor(() =>
      expect(api.reorderPropertyImages).toHaveBeenCalledWith('prop-1', ['b', 'a']),
    );
  });

  it('deletes an image', async () => {
    vi.mocked(api.listPropertyImages).mockResolvedValue([image({ id: 'a' })]);
    vi.mocked(api.deletePropertyImage).mockResolvedValue(undefined);
    render(<PropertyImageManager propertyId="prop-1" />);
    const del = await screen.findByRole('button', { name: /delete photo 1/i });
    fireEvent.click(del);
    await waitFor(() => expect(api.deletePropertyImage).toHaveBeenCalledWith('prop-1', 'a'));
  });
});
