export const metadata = {
  title: 'Política de privacidad — Gimnasio Mix',
};

export default function PoliticaDePrivacidadPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-4 bg-surface px-6 py-10 text-text">
      <h1 className="text-2xl font-semibold">Política de privacidad</h1>
      <p className="text-sm text-text-muted">Última actualización: 22/09/2026</p>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Qué datos guardamos</h2>
        <p>
          Gimnasio Mix guarda únicamente los datos necesarios para operar la aplicación: tu nombre,
          tu nombre de usuario, el gimnasio al que pertenecés, y las rutinas de entrenamiento
          asignadas a tu cuenta. No pedimos ni almacenamos datos de pago, ubicación ni contactos.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Cómo se usan tus datos</h2>
        <p>
          Tus datos se usan exclusivamente para mostrarte tu rutina y permitir que tu profesor o el
          administrador de tu gimnasio la gestionen. No se comparten con terceros ni se usan con
          fines publicitarios.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Contacto</h2>
        <p>
          Si querés que eliminemos tu cuenta o tenés dudas sobre tus datos, pedíselo directamente al
          administrador de tu gimnasio.
        </p>
      </section>
    </main>
  );
}
