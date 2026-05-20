import { Route, Routes } from "react-router-dom";
import MembersList from "./list";
import MemberDetail from "./detail";

export default function Members() {
  return (
    <Routes>
      <Route index element={<MembersList />} />
      <Route path=":id" element={<MemberDetail />} />
    </Routes>
  );
}
