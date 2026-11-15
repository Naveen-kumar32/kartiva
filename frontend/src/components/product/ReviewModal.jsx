import { useFormik } from "formik";
import { Star } from "lucide-react";
import { useState } from "react";

import { saveMyReview } from "@/api";
import { EN } from "@/locales";
import { cn } from "@/utils/cn";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { errorToast, successToast } from "@/utils/toast";
import { createReviewSchema } from "@/validators";

import { Button, FormInput, FormTextarea, Modal, SmartImage } from "../ui";

const R = EN.REVIEW;

/** 1–5 star picker: tap a star, arrow keys work too (radio group). */
function StarPicker({ error, onChange, value }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div>
      <div aria-label={R.YOUR_RATING} className="flex items-center gap-1" onMouseLeave={() => setHover(0)} role="radiogroup">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            aria-checked={value === n}
            aria-label={R.STARS(n)}
            className="rounded p-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            key={n}
            onClick={() => onChange(n)}
            onMouseEnter={() => setHover(n)}
            role="radio"
            type="button"
          >
            <Star aria-hidden className={cn("size-9 transition", n <= shown ? "fill-amber-400 text-amber-400" : "text-slate-300")} />
          </button>
        ))}
        <span className="ml-2 text-sm font-medium text-muted">{shown ? R.LABELS[shown] : R.TAP_TO_RATE}</span>
      </div>
      {error && <p className="mt-1 text-xs text-red-600" role="alert">{error}</p>}
    </div>
  );
}

/** Write or edit the signed-in buyer's review for one product. product = { name, slug, image }. */
export function ReviewModal({ onClose, onSaved, product, review }) {
  const formik = useFormik({
    initialValues: { body: review?.body ?? "", rating: review?.rating ?? 0, title: review?.title ?? "" },
    onSubmit: async (values) => {
      try {
        const saved = await saveMyReview(product.slug, values);
        successToast(review ? R.UPDATED : R.THANKS);
        onSaved(saved);
      } catch (err) {
        errorToast(getErrorMessage(err));
      }
    },
    validationSchema: createReviewSchema(R.VALIDATION),
  });
  const { errors, handleBlur, handleChange, handleSubmit, isSubmitting, setFieldValue, submitCount, touched, values } = formik;
  const field = (name) => ({ error: errors[name], name, onBlur: handleBlur, onChange: handleChange, touched: touched[name], value: values[name] });

  return (
    <Modal onClose={onClose} open title={review ? R.EDIT_TITLE : R.WRITE_TITLE}>
      <form className="space-y-5" noValidate onSubmit={handleSubmit}>
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
          {product.image && <SmartImage alt="" className="size-12 rounded-lg bg-white object-contain p-1" src={product.image} />}
          <p className="line-clamp-2 text-sm font-semibold">{product.name}</p>
        </div>
        <StarPicker error={submitCount > 0 ? errors.rating : null} onChange={(n) => setFieldValue("rating", n)} value={values.rating} />
        <FormInput label={R.TITLE} maxLength={100} placeholder={R.TITLE_PLACEHOLDER} {...field("title")} />
        <FormTextarea label={R.BODY} maxLength={2000} placeholder={R.BODY_PLACEHOLDER} rows={4} {...field("body")} />
        <p className="text-xs text-muted">{R.PUBLIC_NOTE}</p>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="ghost">{EN.COMMON.CANCEL}</Button>
          <Button loading={isSubmitting} type="submit">{review ? R.UPDATE : R.SUBMIT}</Button>
        </div>
      </form>
    </Modal>
  );
}
