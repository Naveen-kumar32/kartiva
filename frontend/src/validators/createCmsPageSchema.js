import * as yup from "yup";

// v = EN.VALIDATION, m = EN.ADMIN_PRO.CONTENT.VALIDATION, takenSlugs = slugs used by other pages
export const createCmsPageSchema = (v, m, takenSlugs = []) =>
  yup.object({
    body: yup.string().trim().min(20, m.BODY_SHORT).required(v.REQUIRED),
    slug: yup.string().trim().matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, m.SLUG_FORMAT).notOneOf(takenSlugs, m.SLUG_TAKEN).max(60).required(v.REQUIRED),
    title: yup.string().trim().min(3, v.NAME_SHORT).max(80).required(v.REQUIRED),
  });
