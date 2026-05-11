import {useEffect, useState} from "react";
import axios from "axios";
import type {Room} from "./types.ts";

function App() {
    const [rooms, setRooms] = useState<Room[]>([]);

    useEffect(() => {
        axios
            .get<Room[]>("http://localhost:8001/rooms")
            .then((res) => setRooms(res.data));
    }, []);

    console.log(rooms);

    return <div>
        {rooms.map((room) => <div key={room.id}>{room.id}</div>)}
    </div>;
}

export default App;
