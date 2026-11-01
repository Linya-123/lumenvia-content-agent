export const metadata = {
  title: "Lumenvia Content Agent",
  description: "跨语言内容生产 · AI 搜索可见性",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}