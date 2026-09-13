/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  async redirects() {
    return [
      // A raiz do site leva direto à agenda do Lux Derma.
      { source: "/", destination: "/derma-lux", permanent: false },
    ];
  },
};

export default nextConfig;
