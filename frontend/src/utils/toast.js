import { toast } from "react-toastify";

export const successToast = (message, options) => toast.success(message, options);
export const errorToast = (message, options) => toast.error(message, options);
export const infoToast = (message, options) => toast.info(message, options);
