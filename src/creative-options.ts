// Mirrored from Furnio web creative-options.ts; parity is enforced by tests.
export type VisualChoiceOption<T extends string = string> = { value: T; label: string; image: string; imagePosition?: string; description?: string }

const image = (id: string, position = 'center'): { image: string; imagePosition: string } => ({
  image: `https://images.unsplash.com/${id}?auto=format&fit=crop&w=420&h=300&q=78`,
  imagePosition: position,
})

export const roomTypeOptions = [
  { ...image('photo-1493809842364-78817add7ffb'), label: 'Living room', value: 'Living room' },
  { ...image('photo-1616594039964-ae9021a400a0'), label: 'Primary bedroom', value: 'Primary bedroom' },
  { ...image('photo-1560448204-e02f11c3d0e2'), label: 'Bedroom', value: 'Bedroom' },
  { ...image('photo-1600210492486-724fe5c67fb0'), label: 'Dining room', value: 'Dining room' },
  { ...image('photo-1498050108023-c5249f4df085'), label: 'Home office', value: 'Home office' },
  { ...image('photo-1556909114-f6e7ad7d3136'), label: 'Kitchen', value: 'Kitchen' },
  { ...image('photo-1600566753086-00f18fb6b3ea'), label: 'Bathroom', value: 'Bathroom' },
  { ...image('photo-1560448204-603b3fc33ddc'), label: 'Basement', value: 'Basement' },
  { ...image('photo-1505691723518-36a5ac3be353', 'center 30%'), label: 'Attic', value: 'Attic' },
  { ...image('photo-1505691938895-1758d7feb511'), label: 'Other', value: 'Other' },
] as const satisfies readonly VisualChoiceOption<string>[]
export const furnitureStyleOptions = [
  { ...image('photo-1560448204-603b3fc33ddc'), description: 'Let AI choose a restrained listing-ready direction.', label: 'No preference', value: '' },
  { ...image('photo-1600210492486-724fe5c67fb0'), label: 'Warm contemporary', value: 'Warm contemporary' },
  { ...image('photo-1600607687920-4e2a09cf159d'), label: 'Contemporary', value: 'Contemporary' },
  { ...image('photo-1493809842364-78817add7ffb'), label: 'Scandinavian', value: 'Scandinavian' },
  { ...image('photo-1564013799919-ab600027ffc6'), label: 'Modern farmhouse', value: 'Modern farmhouse' },
  { ...image('photo-1560448204-e02f11c3d0e2'), label: 'Modern', value: 'Modern' },
  { ...image('photo-1505691938895-1758d7feb511'), label: 'Transitional', value: 'Transitional' },
  { ...image('photo-1505691723518-36a5ac3be353'), label: 'Japandi', value: 'Japandi' },
  { ...image('photo-1570129477492-45c003edd2be'), label: 'Coastal', value: 'Coastal' },
  { ...image('photo-1523475472560-d2df97ec485c'), label: 'Industrial', value: 'Industrial' },
  { ...image('photo-1600566753086-00f18fb6b3ea'), label: 'Luxury', value: 'Luxury' },
  { ...image('photo-1556909114-f6e7ad7d3136'), label: 'Rustic', value: 'Rustic' },
  { ...image('photo-1505691938895-1758d7feb511', 'center 70%'), label: 'Traditional', value: 'Traditional' },
  { ...image('photo-1560472354-b33ff0c44a43'), label: 'Minimalist', value: 'Minimalist staging' },
] as const satisfies readonly VisualChoiceOption<string>[]

export const moodOptions = [
  { ...image('photo-1560448204-603b3fc33ddc'), description: 'Keep the light and color temperature closest to the source.', label: 'Original mood', value: '' },
  { ...image('photo-1600607687920-4e2a09cf159d'), label: 'Bright & airy', value: 'Bright and airy' },
  { ...image('photo-1600210492486-724fe5c67fb0'), label: 'Warm & cozy', value: 'Warm and cozy' },
  { ...image('photo-1505691723518-36a5ac3be353'), label: 'Calm & neutral', value: 'Calm and neutral' },
  { ...image('photo-1493809842364-78817add7ffb'), label: 'Fresh & natural', value: 'Fresh and natural' },
  { ...image('photo-1600566753086-00f18fb6b3ea'), label: 'Luxury editorial', value: 'Luxury editorial' },
  { ...image('photo-1523475472560-d2df97ec485c'), label: 'Moody & dramatic', value: 'Moody and dramatic' },
] as const satisfies readonly VisualChoiceOption<string>[]

export const twilightVisualOptions = [
  { ...image('photo-1495616811223-4d98c6e9c869'), description: 'Rose, blush, and restrained lavender with warm property lights.', label: 'Pink twilight', value: 'pink_twilight' },
  { ...image('photo-1519608487953-e999c86e7455'), description: 'Deep natural blue hour balanced with warm windows and fixtures.', label: 'Blue hour', value: 'blue_hour' },
  { ...image('photo-1472120435266-53107fd0c44a'), description: 'A subtle amber-to-blue sunset that stays true to the property.', label: 'Natural dusk', value: 'natural_dusk' },
] as const satisfies readonly VisualChoiceOption<string>[]

export const exteriorVisualOptions = [
  { ...image('photo-1564013799919-ab600027ffc6', 'center 80%'), description: 'Clear dirt, stains, debris, and leaves without resurfacing.', label: 'Clean driveway', value: 'clean_driveway' },
  { ...image('photo-1570129477492-45c003edd2be', 'center 85%'), description: 'Restore only existing lawn areas with natural green texture.', label: 'Green grass', value: 'green_grass' },
  { ...image('photo-1564013799919-ab600027ffc6', 'center 10%'), description: 'Add a believable blue sky with restrained soft clouds.', label: 'Natural blue sky', value: 'blue_sky' },
  { ...image('photo-1570129477492-45c003edd2be', 'left 80%'), description: 'Clear loose fallen leaves and reveal the true surface below.', label: 'Remove leaves', value: 'remove_leaves' },
] as const satisfies readonly VisualChoiceOption<string>[]

export const seasonVisualOptions = [
  { ...image('photo-1564013799919-ab600027ffc6'), description: 'Remove snow and winter dormancy while preserving the exact property.', label: 'Natural summer', value: 'natural_summer' },
] as const satisfies readonly VisualChoiceOption<string>[]
