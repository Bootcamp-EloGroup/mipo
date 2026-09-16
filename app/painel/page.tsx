import type { Metadata } from "next";
import { MipoDashboard } from "@/src/components/mipo-dashboard";
import "./painel.css";

export const metadata: Metadata = { title:"Painel MIPO — Vértice", description:"Intervenções e decisões observadas no protótipo MIPO." };
export default function PanelPage(){return <MipoDashboard/>;}
