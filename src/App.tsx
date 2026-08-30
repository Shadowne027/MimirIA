import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ThemeProvider, ThemeToggleFab } from "./lib/theme";
import LandingPage from "./pages/LandingPage";
import ChatPage from "./pages/ChatPage";

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="*" element={<LandingPage />} />
          </Routes>
        </BrowserRouter>
        {/* Botón flotante de modo oscuro — visible en todas las páginas */}
        <ThemeToggleFab />
      </AuthProvider>
    </ThemeProvider>
  );
}
