import { Navigate, useSearchParams } from "react-router-dom";

export function RegisterPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const suffix = token ? `&token=${encodeURIComponent(token)}` : "";

  return <Navigate replace to={`/login?mode=register${suffix}`} />;
}
