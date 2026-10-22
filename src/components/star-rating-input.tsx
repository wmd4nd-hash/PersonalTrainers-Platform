"use client";

import { useState } from "react";
import { ratingLabel } from "@/lib/reviews";
import { StarIcon } from "./star-rating";
import { cx } from "./ui";

/**
 * Star picker built on a native radio group, so it works without JavaScript and
 * keeps the browser's keyboard support: Tab moves into the group, the arrow keys
 * change the rating and Space selects.
 */
export function StarRatingInput({
  name,
  label,
  defaultValue = 0,
  errors,
  required = true,
}: {
  name: string;
  label: string;
  defaultValue?: number;
  errors?: string[];
  required?: boolean;
}) {
  const [value, setValue] = useState(defaultValue);
  const [hovered, setHovered] = useState(0);
  const shown = hovered || value;
  const errorId = `${name}-error`;

  return (
    <fieldset aria-describedby={errors?.length ? errorId : undefined}>
      <legend className="mb-1 block text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="-ml-1 flex" onMouseLeave={() => setHovered(0)}>
          {[1, 2, 3, 4, 5].map((star) => (
            <label
              key={star}
              onMouseEnter={() => setHovered(star)}
              className="cursor-pointer rounded-md p-1 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand"
            >
              <input
                type="radio"
                name={name}
                value={star}
                checked={value === star}
                onChange={() => setValue(star)}
                required={required}
                className="sr-only"
              />
              <StarIcon
                className={cx(
                  "size-9 transition-colors sm:size-8",
                  star <= shown ? "text-amber-500" : "text-line",
                )}
              />
              <span className="sr-only">
                {star} {star === 1 ? "star" : "stars"}, {ratingLabel(star)}
              </span>
            </label>
          ))}
        </div>
        <span aria-hidden="true" className={cx("text-sm", shown ? "font-medium" : "text-subtle")}>
          {shown ? ratingLabel(shown) : "Choose a rating"}
        </span>
      </div>
      {errors?.length ? (
        <p id={errorId} className="mt-1 text-xs text-red-600 dark:text-red-400">
          {errors.join(" ")}
        </p>
      ) : null}
    </fieldset>
  );
}
