import type { Metadata } from "next";
import HeadquartersLoader from "./HeadquartersLoader";

export const metadata: Metadata = {
  title: "Virtual Headquarters — HN.CO Intelligence Hub",
};

export default function HeadquartersPage() {
  return <HeadquartersLoader />;
}
