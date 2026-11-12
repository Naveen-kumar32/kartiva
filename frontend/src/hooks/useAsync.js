import { useCallback, useEffect, useRef, useState } from "react";

import { getErrorMessage } from "@/utils";

// Runs an async loader and tracks { data, loading, error }. Re-runs when deps change.
export function useAsync(loader, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const callId = useRef(0);

  const run = useCallback(() => {
    const id = ++callId.current;
    setState((s) => ({ ...s, error: null, loading: true }));
    loader()
      .then((data) => id === callId.current && setState({ data, error: null, loading: false }))
      .catch((err) => id === callId.current && setState({ data: null, error: getErrorMessage(err), loading: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { run(); }, [run]);

  return { ...state, reload: run, setData: (data) => setState((s) => ({ ...s, data })) };
}
