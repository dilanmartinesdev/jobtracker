import { useAuth } from "./auth/AuthContext";
import { AuthScreen } from "./components/AuthScreen";
import { Workspace } from "./components/Workspace";

export default function App() {
  const { user, isChecking } = useAuth();

  if (isChecking) {
    return (
      <p className="boot" role="status">
        Loading…
      </p>
    );
  }
  return user ? <Workspace /> : <AuthScreen />;
}
