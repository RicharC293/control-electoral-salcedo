import { aplicarColorSemilla } from "@control-electoral/domain";
import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { obtenerPerfilPanel, type PerfilPanel } from "./lib/auth";
import { obtenerColorSemilla } from "./lib/config";
import { ActasList } from "./pages/ActasList";
import { AuditoriaDetail } from "./pages/AuditoriaDetail";
import { Dashboard } from "./pages/Dashboard";
import { Login } from "./pages/Login";
import { Apariencia } from "./pages/admin/Apariencia";
import { Candidatos } from "./pages/admin/Candidatos";
import { Contiendas } from "./pages/admin/Contiendas";
import { Perfiles } from "./pages/admin/Perfiles";

export default function App() {
  const [perfil, setPerfil] = useState<PerfilPanel | null | "cargando">("cargando");

  const cargarPerfil = useCallback(() => {
    setPerfil("cargando");
    obtenerPerfilPanel().then(setPerfil);
  }, []);

  useEffect(() => {
    cargarPerfil();
  }, [cargarPerfil]);

  useEffect(() => {
    obtenerColorSemilla().then(aplicarColorSemilla);
  }, []);

  if (perfil === "cargando") {
    return (
      <div className="pantalla-login">
        <p>Cargando...</p>
      </div>
    );
  }

  if (!perfil) {
    return <Login onIngreso={cargarPerfil} />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard perfil={perfil} onSalir={cargarPerfil} />} />
        <Route path="/actas" element={<ActasList perfil={perfil} onSalir={cargarPerfil} />} />
        <Route path="/actas/:id" element={<AuditoriaDetail />} />
        {perfil.rol === "ADMIN" ? (
          <>
            <Route path="/admin/contiendas" element={<Contiendas rol={perfil.rol} />} />
            <Route path="/admin/candidatos" element={<Candidatos rol={perfil.rol} />} />
            <Route path="/admin/perfiles" element={<Perfiles rol={perfil.rol} perfilId={perfil.id} />} />
            <Route path="/admin/apariencia" element={<Apariencia rol={perfil.rol} />} />
          </>
        ) : (
          <Route path="/admin/*" element={<Navigate to="/" replace />} />
        )}
      </Routes>
    </BrowserRouter>
  );
}
