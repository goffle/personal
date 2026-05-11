import { Route, Routes } from "react-router-dom";
import AgentList from "./list";
import AgentDetail from "./detail";

export default function Agents() {
  return (
    <Routes>
      <Route index element={<AgentList />} />
      <Route path=":id" element={<AgentDetail />} />
    </Routes>
  );
}
