import * as yup from "yup";

// Buyer rating & review. v = EN.REVIEW.VALIDATION.
export const createReviewSchema = (v) =>
  yup.object({
    body: yup.string().trim().max(2000, v.BODY_LONG),
    rating: yup.number().typeError(v.RATING_REQUIRED).integer(v.RATING_REQUIRED).min(1, v.RATING_REQUIRED).max(5, v.RATING_REQUIRED).required(v.RATING_REQUIRED),
    title: yup.string().trim().max(100, v.TITLE_LONG),
  });
