/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 落地页 HTML 以字符串形式存储并直接返回，避免被框架二次包装
  experimental: {},
  async headers() {
    return [
      {
        // 生成的落地页可以被任意来源嵌入预览
        source: '/api/preview/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;