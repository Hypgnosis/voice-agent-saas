import { NextResponse } from 'next/server';

export async function POST(request) {
    try {
        const { pin } = await request.json();
        const masterPin = process.env.ADMIN_MASTER_PIN;

        if (!masterPin) {
            return NextResponse.json(
                { error: 'Server configuration error — ADMIN_MASTER_PIN not set' },
                { status: 500 }
            );
        }

        if (!pin || pin.trim() !== masterPin) {
            return NextResponse.json(
                { error: 'Invalid master PIN' },
                { status: 403 }
            );
        }

        return NextResponse.json({ authenticated: true });
    } catch (error) {
        return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
    }
}
