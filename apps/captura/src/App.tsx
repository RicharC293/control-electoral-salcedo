import { aplicarColorSemilla } from "@control-electoral/domain";
import { useEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { obtenerColorSemilla } from "./lib/queries";
import { ToastProvider } from "./lib/toast";
import { Home } from "./pages/Home";
import { TokenGate } from "./pages/TokenGate";

export default function App() {
  useEffect(() => {
    obtenerColorSemilla().then(aplicarColorSemilla);
  }, []);

  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/t/:token" element={<TokenGate />} />
          <Route path="/" element={<Home />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
