"use client";

import { useRef } from "react";
import { updateCompanyPriority } from "@/app/companies/actions";

type PrioritySelectFormProps = {
  companyId: string;
  priority: number;
};

export function PrioritySelectForm({ companyId, priority }: PrioritySelectFormProps) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form action={updateCompanyPriority} className="inline-priority-form" ref={formRef}>
      <input name="companyId" type="hidden" value={companyId} />
      <select
        aria-label="企业优先级"
        name="priority"
        defaultValue={String(priority)}
        onChange={() => {
          formRef.current?.requestSubmit();
        }}
      >
        {[3, 2, 1, 0].map((item) => (
          <option key={item} value={item}>
            P{item}
          </option>
        ))}
      </select>
    </form>
  );
}
