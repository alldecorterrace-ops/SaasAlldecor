import { ShareAccess } from "@/components/share-access";
import { Brand } from "@/components/brand";
export default function Access() {
  return (
    <main className="max-w-lg mx-auto px-5 py-12 space-y-6">
      <Brand />
      <h1 className="page-title">Acceso del cliente</h1>
      <ShareAccess />
    </main>
  );
}
