import type { Metadata } from "next";
import { ManagerDashboard } from "@/src/components/manager-dashboard";
import "./painel-v2.css";

export const metadata: Metadata = { title:"Painel MIPO — Vértice", description:"Intervenções e decisões observadas no protótipo MIPO." };
export default function PanelPage(){return <ManagerDashboard/>;}
