import { Route, Routes } from "react-router-dom";
import TaskList from "./list";
import TaskDetail from "./detail";

export default function Tasks() {
  return (
    <Routes>
      <Route index element={<TaskList />} />
      <Route path=":id" element={<TaskDetail />} />
    </Routes>
  );
}
