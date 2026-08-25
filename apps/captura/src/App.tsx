import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Home } from "./pages/Home";
import { TokenGate } from "./pages/TokenGate";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/t/:token" element={<TokenGate />} />
        <Route path="/" element={<Home />} />
      </Routes>
    </BrowserRouter>
  );
}
