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
          fontSize: 90,
          fontWeight: 'bold',
          borderRadius: 24,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #4f7eff, #3d6cff)',
            width: 140,
            height: 140,
            borderRadius: 30,
            boxShadow: '0 8px 16px rgba(0,0,0,0.4)',
          }}
        >
          A
        </div>
      </div>
    ),
    {
      width: 192,
      height: 192,
    }
  );
}
