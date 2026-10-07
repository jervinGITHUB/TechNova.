import { AudioTrack } from '../types';

/**
 * High-quality curated album cover artwork for music tracks
 * Guarantees that every audio track has a stunning visual thumbnail on both
 * client side (sound picker, video upload, feed) and admin side.
 */
const CURATED_COVERS: Record<string, string> = {
  electronic: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=400&auto=format&fit=crop',
  synthwave: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=400&auto=format&fit=crop',
  lofi: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=400&auto=format&fit=crop',
  chill: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=400&auto=format&fit=crop',
  pop: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&auto=format&fit=crop',
  dance: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&auto=format&fit=crop',
  rock: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=400&auto=format&fit=crop',
  metal: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=400&auto=format&fit=crop',
  hiphop: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&auto=format&fit=crop',
  rap: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&auto=format&fit=crop',
  bass: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&auto=format&fit=crop',
  acoustic: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=400&auto=format&fit=crop',
  gaming: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400&auto=format&fit=crop',
  phonk: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400&auto=format&fit=crop',
  trending: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&auto=format&fit=crop',
};

const FALLBACK_PALETTE = [
  'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=400&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=400&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=400&auto=format&fit=crop',
];

export const getCuratedCoverForTrack = (
  title = '',
  artist = '',
  category = 'Trending'
): string => {
  const text = `${title} ${artist} ${category}`.toLowerCase();

  if (text.includes('synth') || text.includes('retro') || text.includes('electronic') || text.includes('electro')) {
    return CURATED_COVERS.electronic;
  }
  if (text.includes('lo-fi') || text.includes('lofi') || text.includes('chill') || text.includes('ambient') || text.includes('sunset')) {
    return CURATED_COVERS.lofi;
  }
  if (text.includes('pop') || text.includes('dance') || text.includes('club')) {
    return CURATED_COVERS.pop;
  }
  if (text.includes('rock') || text.includes('metal') || text.includes('guitar')) {
    return CURATED_COVERS.rock;
  }
  if (text.includes('hip hop') || text.includes('hiphop') || text.includes('rap') || text.includes('beat') || text.includes('trap')) {
    return CURATED_COVERS.hiphop;
  }
  if (text.includes('bass') || text.includes('groove') || text.includes('sub')) {
    return CURATED_COVERS.bass;
  }
  if (text.includes('game') || text.includes('gaming') || text.includes('pixel') || text.includes('hero')) {
    return CURATED_COVERS.gaming;
  }
  if (text.includes('phonk') || text.includes('drift')) {
    return CURATED_COVERS.phonk;
  }
  if (text.includes('acoustic') || text.includes('piano') || text.includes('guitar')) {
    return CURATED_COVERS.acoustic;
  }

  // Deterministic fallback based on title + artist string
  let sum = 0;
  for (let i = 0; i < text.length; i++) {
    sum += text.charCodeAt(i);
  }
  return FALLBACK_PALETTE[sum % FALLBACK_PALETTE.length];
};

export const isDeprecatedDefaultTrack = (track?: Partial<AudioTrack> | null): boolean => {
  if (!track) return false;
  const id = (track.id || '').toLowerCase();
  const title = (track.title || '').toLowerCase();
  if (
    id === 'track_synthwave_energy' ||
    id === 'track_lofi_sunset' ||
    id === 'track_deep_bass_groove'
  ) {
    return true;
  }
  if (
    title.includes('deep bass groove') ||
    title.includes('lo-fi chill sunset') ||
    title.includes('lofi chill sunset') ||
    title.includes('neon horizon')
  ) {
    return true;
  }
  return false;
};

export const resolveTrackCover = (
  track?: Partial<AudioTrack> | null,
  fallbackCategory = 'Trending'
): string => {
  if (!track) {
    return getCuratedCoverForTrack('', '', fallbackCategory);
  }

  const raw = track.coverUrl?.trim();
  // Ensure the coverUrl is not a video file
  if (raw && !/\.(mp4|webm|mov|mkv|ogg|m4v|avi)($|\?)/i.test(raw)) {
    return raw;
  }

  // If this is an original sound from a user video, default to a personalized user avatar, never a generic music stock photo!
  const isOriginalSound = Boolean(
    track.sourceVideoId ||
    track.sourceUsername ||
    track.title?.toLowerCase().startsWith('original sound')
  );

  if (isOriginalSound) {
    const seed = track.sourceUsername || track.artist?.split('·')[0]?.trim() || 'user';
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;
  }

  return getCuratedCoverForTrack(track.title || '', track.artist || '', track.category || fallbackCategory);
};
