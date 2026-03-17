import VoiceAgent from '@/components/VoiceAgent';

// This is the standalone embed route that provides an iframe-friendly view
export default async function EmbedPage({ params, searchParams }) {
    const resolvedParams = await params;
    const resolvedSearchParams = await searchParams;
    const slug = resolvedParams.slug || 'yo-te-cuido';
    const parentInstructions = resolvedSearchParams.instructions || '';

    return (
        <div className="w-full h-full overflow-hidden">
            <VoiceAgent slug={slug} parentInstructions={parentInstructions} />
        </div>
    );
}
