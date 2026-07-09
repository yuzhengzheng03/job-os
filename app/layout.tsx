import type { Metadata } from "next";
import Link from "next/link";
import { NavLinks } from "@/app/nav-links";
import "./globals.css";

export const metadata: Metadata = {
  title: "Job OS",
  description: "个人求职机会管理工作台"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <aside className="sidebar">
            <Link className="brand" href="/opportunities">
              <strong>Job OS</strong>
              <span>个人求职机会管理</span>
            </Link>
            <NavLinks />
          </aside>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
