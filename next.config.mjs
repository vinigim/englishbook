/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [{ source: "/", destination: "/vagas", permanent: false }];
  },
  // imapflow e mailparser usam módulos nativos do Node; não devem passar pelo bundler.
  serverExternalPackages: ["imapflow", "mailparser"],
};

export default nextConfig;
