export const SUPPORTED_CARRIERS = [
  { code: 'DHL', name: 'DHL Express', api: true },
  { code: 'Royal Mail', name: 'Royal Mail', api: false },
  { code: 'Parcelforce', name: 'Parcelforce Worldwide', api: false },
  { code: 'DPD', name: 'DPD UK', api: false },
  { code: 'Evri', name: 'Evri', api: false },
  { code: 'Yodel', name: 'Yodel', api: false },
  { code: 'UPS', name: 'UPS', api: false },
  { code: 'FedEx', name: 'FedEx', api: false },
  { code: 'Other', name: 'Other / own courier', api: false }
] as const;

const TRACKING_URLS: Record<string, (t: string) => string> = {
  dhl: (t) => `https://www.dhl.com/gb-en/home/tracking.html?tracking-id=${t}`,
  'royal mail': (t) => `https://www.royalmail.com/track-your-item#/tracking-results/${t}`,
  parcelforce: (t) => `https://www.parcelforce.com/track-trace?trackNumber=${t}`,
  dpd: (t) => `https://track.dpd.co.uk/parcels/${t}`,
  evri: (t) => `https://www.evri.com/track/parcel/${t}`,
  yodel: (t) => `https://www.yodel.co.uk/tracking/${t}`,
  ups: (t) => `https://www.ups.com/track?tracknum=${t}`,
  fedex: (t) => `https://www.fedex.com/fedextrack/?trknbr=${t}`
};

export function trackingUrlFor(carrier: string | null | undefined, trackingNumber: string | null | undefined): string | null {
  if (!carrier || !trackingNumber) return null;
  const build = TRACKING_URLS[carrier.trim().toLowerCase()];
  return build ? build(encodeURIComponent(trackingNumber.trim())) : null;
}
