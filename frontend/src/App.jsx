import { ToastContainer } from "react-toastify";

import { AppRoutes } from "@/routes";

import "react-toastify/dist/ReactToastify.css";

export default function App() {
  return (
    <>
      <AppRoutes />
      {/* react-toastify v11: theme="light" avoids the grey overlay bug (Day-1 notes §8) */}
      <ToastContainer autoClose={2500} newestOnTop position="bottom-right" theme="light" />
    </>
  );
}
