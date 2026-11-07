/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // The organiser link carries its credential in the query string; never send it on as a referrer.
  async headers() {
    return [{ source: '/e/:eventId/admin', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }] }];
  },
};

export default nextConfig;
