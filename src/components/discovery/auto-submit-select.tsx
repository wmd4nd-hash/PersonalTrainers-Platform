"use client";

import type { ComponentProps } from "react";
import { Select } from "@/components/ui";

/** A select that submits its form as soon as it changes, e.g. a sort order. */
export function AutoSubmitSelect(props: ComponentProps<typeof Select>) {
  return <Select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
