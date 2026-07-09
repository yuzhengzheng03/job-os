"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/src/lib/prisma";

function splitTags(value: string) {
  return value
    .split(/[,，、/；;｜|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function updateCompanyPriority(formData: FormData) {
  const companyId = String(formData.get("companyId") || "");
  const priority = Number(formData.get("priority"));

  if (!companyId || !Number.isFinite(priority)) {
    return;
  }

  await prisma.company.update({
    where: { id: companyId },
    data: {
      priority: Math.max(0, Math.min(3, priority))
    }
  });

  revalidatePath("/companies");
}

export async function updateCompanyTags(formData: FormData) {
  const companyId = String(formData.get("companyId") || "");
  const tags = splitTags(String(formData.get("tags") || ""));

  if (!companyId) {
    return;
  }

  await prisma.company.update({
    where: { id: companyId },
    data: { tags }
  });

  revalidatePath("/companies");
}
