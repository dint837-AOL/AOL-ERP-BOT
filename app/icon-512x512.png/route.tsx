import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0d0f18',
          color: '#ffffff',
          fontSize: 240,
          fontWeight: 'bold',
          borderRadius: 64,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #4f7eff, #3d6cff)',
            width: 380,
            height: 380,
            borderRadius: 80,
            boxShadow: '0 16px 32px rgba(0,0,0,0.4)',
          }}
        >
          A
        </div>
      </div>
    ),
    {
      width: 512,
      height: 512,
    }
  );
}
