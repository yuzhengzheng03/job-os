"use client";

import { useRef } from "react";
import { updateCompanyTags } from "@/app/companies/actions";

type TagsInputFormProps = {
  companyId: string;
  tags: string[];
};

export function TagsInputForm({ companyId, tags }: TagsInputFormProps) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form action={updateCompanyTags} className="inline-tags-form" ref={formRef}>
      <input name="companyId" type="hidden" value={companyId} />
      <input
        aria-label="企业标签"
        name="tags"
        defaultValue={tags.join("、")}
        placeholder="医疗器械、产品、北京"
        onBlur={() => {
          formRef.current?.requestSubmit();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            formRef.current?.requestSubmit();
          }
        }}
      />
    </form>
  );
}
