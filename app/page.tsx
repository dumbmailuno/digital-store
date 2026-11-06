import { Catalog } from "@/components/shop/catalog";

export const dynamic = "force-dynamic";

export default function Home({ searchParams }: { searchParams: { q?: string; cat?: string; page?: string; sort?: string; view?: string } }) {
  return <Catalog searchParams={searchParams} path="/" />;
}
