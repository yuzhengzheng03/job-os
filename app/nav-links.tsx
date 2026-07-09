"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/opportunities", label: "岗位管理看板" },
  { href: "/search-profiles", label: "划定求职范围" },
  { href: "/companies", label: "企业招聘追踪" },
  { href: "/discovered", label: "待确认岗位池" }
];

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav className="nav" aria-label="Main navigation">
      {navItems.map((item) => (
        <Link aria-current={isActivePath(pathname, item.href) ? "page" : undefined} className={isActivePath(pathname, item.href) ? "active" : undefined} href={item.href} key={item.href}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
