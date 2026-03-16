'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import VoiceAgent from '@/components/VoiceAgent';

function AgentPageContent() {
    const searchParams = useSearchParams();
    // Use the `agent` search param instead of a path slug to be entirely compatible with static HTML exports.
    const slug = searchParams.get('agent') || 'yo-te-cuido';
    const parentInstructions = searchParams.get('instructions') || '';

    return <VoiceAgent slug={slug} parentInstructions={parentInstructions} />;
}

export default function AgentPage() {
    return (
        <Suspense fallback={<div className="h-screen w-full bg-obsidian flex items-center justify-center text-mercury text-xs uppercase tracking-widest">Initializing Protocol...</div>}>
            <AgentPageContent />
        </Suspense>
    );
}
