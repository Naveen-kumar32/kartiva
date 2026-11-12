import { createSlice } from "@reduxjs/toolkit";

const uiSlice = createSlice({
  initialState: { mobileMenuOpen: false },
  name: "ui",
  reducers: {
    setMobileMenuOpen: (state, { payload }) => {
      state.mobileMenuOpen = payload;
    },
  },
});

export const { setMobileMenuOpen } = uiSlice.actions;
export const selectMobileMenuOpen = (state) => state.ui.mobileMenuOpen;
export default uiSlice.reducer;
