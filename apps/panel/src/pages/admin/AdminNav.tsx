import { NavLink } from "react-router-dom";

type Props = { rol: "ADMIN" | "AUDITOR" };

export function AdminNav({ rol }: Props) {
  return (
    <nav className="admin-nav">
      <NavLink to="/" end>
        Dashboard
      </NavLink>
      <NavLink to="/actas">Actas</NavLink>
      {rol === "ADMIN" && (
        <>
          <NavLink to="/admin/contiendas">Contiendas</NavLink>
          <NavLink to="/admin/candidatos">Candidatos</NavLink>
          <NavLink to="/admin/perfiles">Perfiles</NavLink>
          <NavLink to="/admin/apariencia">Apariencia</NavLink>
        </>
      )}
    </nav>
  );
}
