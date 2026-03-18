import VoiceAgent from '@/components/VoiceAgent';

// In Next.js App Router, dynamic route params are passed as props to the page.
export default async function AgentPage({ params, searchParams }) {
    // Await params since it can occasionally be treated as a promise in React 18 / Next 15 RSC boundaries.
    const resolvedParams = await params;
    const resolvedSearchParams = await searchParams;
    const slug = resolvedParams.slug || 'yo-te-cuido';
    const parentInstructions = resolvedSearchParams.parentInstructions || resolvedSearchParams.instructions || '';

    return <VoiceAgent slug={slug} parentInstructions={parentInstructions} />;
}
