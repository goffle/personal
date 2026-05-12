import { Route, Routes } from "react-router-dom";
import DataRoomList from "./list";
import DataRoomDetail from "./detail";

export default function DataRoom() {
  return (
    <Routes>
      <Route index element={<DataRoomList />} />
      <Route path=":id" element={<DataRoomDetail />} />
    </Routes>
  );
}
