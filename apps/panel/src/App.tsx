import { aplicarColorSemilla } from "@control-electoral/domain";
import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { obtenerPerfilPanel, type PerfilPanel } from "./lib/auth";
import { obtenerColorSemilla } from "./lib/config";
import { ActasList } from "./pages/ActasList";
import { AuditoriaDetail } from "./pages/AuditoriaDetail";
import { Dashboard } from "./pages/Dashboard";
import { Login } from "./pages/Login";
import { Candidatos } from "./pages/admin/Candidatos";
import { Configuraciones } from "./pages/admin/Configuraciones";
import { Contiendas } from "./pages/admin/Contiendas";
import { Usuarios } from "./pages/admin/Usuarios";
import { Veeduria } from "./pages/admin/Veeduria";
import { ToastProvider } from "./lib/toast";

export default function App() {
  return (
    <ToastProvider>
      <Contenido />
    </ToastProvider>
  );
}

function Contenido() {
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
        <Route path="/actas/:id" element={<AuditoriaDetail perfilId={perfil.id} />} />
        {perfil.rol === "ADMIN" ? (
          <>
            <Route path="/admin/contiendas" element={<Contiendas rol={perfil.rol} />} />
            <Route path="/admin/candidatos" element={<Candidatos rol={perfil.rol} />} />
            <Route path="/admin/veeduria" element={<Veeduria rol={perfil.rol} perfilId={perfil.id} />} />
            <Route path="/admin/usuarios" element={<Usuarios rol={perfil.rol} perfilId={perfil.id} />} />
            <Route path="/admin/configuraciones" element={<Configuraciones rol={perfil.rol} />} />
          </>
        ) : (
          <Route path="/admin/*" element={<Navigate to="/" replace />} />
        )}
      </Routes>
    </BrowserRouter>
  );
}
