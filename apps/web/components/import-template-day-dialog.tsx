'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { browserApiFetch, BrowserApiError } from '../lib/browser-api-client';
import { PlantillaParaImportar, TemplateDetailApi } from '../lib/routine-types';
import { SeleccionImportacion, aPlantillaParaImportar } from '../lib/routine-days';

interface ExerciseSummary {
  id: string;
  nombre: string;
  imageUrl: string | null;
}

async function cargarPlantilla(id: string): Promise<PlantillaParaImportar> {
  const detalle = await browserApiFetch<TemplateDetailApi>(`routine-templates/${id}`);
  const ids = [...new Set(detalle.dias.flatMap((d) => d.ejercicios.map((e) => e.exerciseId)))];
  const resumenes =
    ids.length > 0
      ? await browserApiFetch<ExerciseSummary[]>(`exercises/by-ids?ids=${ids.join(',')}`)
      : [];
  return aPlantillaParaImportar(detalle, new Map(resumenes.map((r) => [r.id, r])));
}

const AGREGAR = 'agregar';

export function ImportTemplateDayDialog({
  abierto,
  onAbiertoChange,
  plantillas,
  diasActuales,
  puedeAgregar,
  onImportar,
}: {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  plantillas: Array<{ id: string; nombre: string }>;
  diasActuales: Array<{ uid: string; numero: number }>;
  puedeAgregar: boolean;
  onImportar: (plantilla: PlantillaParaImportar, seleccion: SeleccionImportacion) => void;
}) {
  // El padre remonta este componente cada vez que se abre (key), así que
  // el estado inicial siempre refleja los días actuales.
  const [plantillaId, setPlantillaId] = useState('');
  const [plantilla, setPlantilla] = useState<PlantillaParaImportar | null>(null);
  const [diaId, setDiaId] = useState<string>('todos');
  const [destino, setDestino] = useState<string>(() =>
    puedeAgregar ? AGREGAR : (diasActuales[0]?.uid ?? AGREGAR),
  );
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!plantillaId) {
      setPlantilla(null);
      return;
    }
    let cancelado = false;
    setCargando(true);
    setError(null);
    cargarPlantilla(plantillaId)
      .then((p) => {
        if (cancelado) return;
        setPlantilla(p);
        setDiaId(p.dias.length > 1 ? 'todos' : (p.dias[0]?.id ?? 'todos'));
      })
      .catch((err) => {
        if (!cancelado)
          setError(
            err instanceof BrowserApiError ? err.message : 'No se pudo cargar la plantilla.',
          );
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [plantillaId]);

  const diaElegido = plantilla?.dias.find((d) => d.id === diaId);
  const esCompleta = diaId === 'todos';
  const puedeConfirmar =
    Boolean(plantilla) &&
    plantilla!.dias.length > 0 &&
    (esCompleta || destino !== AGREGAR || puedeAgregar);

  function confirmar() {
    if (!plantilla) return;
    onImportar(plantilla, {
      diaId,
      reemplazarUid: esCompleta || destino === AGREGAR ? null : destino,
    });
    onAbiertoChange(false);
  }

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Traer de plantilla</DialogTitle>
          <DialogDescription>Elegí una plantilla y qué día querés traer.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Field>
            <FieldLabel htmlFor="importar-plantilla">Plantilla</FieldLabel>
            <NativeSelect
              id="importar-plantilla"
              value={plantillaId}
              onChange={(e) => setPlantillaId(e.target.value)}
            >
              <NativeSelectOption value="">Elegir plantilla...</NativeSelectOption>
              {plantillas.map((p) => (
                <NativeSelectOption key={p.id} value={p.id}>
                  {p.nombre}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>

          {cargando && <Spinner />}

          {plantilla && plantilla.dias.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Esta plantilla todavía no tiene ejercicios.
            </p>
          )}

          {plantilla && plantilla.dias.length > 0 && (
            <>
              <Field>
                <FieldLabel htmlFor="importar-dia">Qué traer</FieldLabel>
                <NativeSelect
                  id="importar-dia"
                  value={diaId}
                  onChange={(e) => setDiaId(e.target.value)}
                >
                  {plantilla.dias.length > 1 && (
                    <NativeSelectOption value="todos">
                      Plantilla completa ({plantilla.dias.length} días)
                    </NativeSelectOption>
                  )}
                  {plantilla.dias.map((d) => (
                    <NativeSelectOption key={d.id} value={d.id}>
                      Día {d.numero} ({d.ejercicios.length} ejercicios)
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>

              {diaElegido && (
                <ul className="flex flex-col gap-1 rounded-lg border border-border p-3 text-sm text-muted-foreground">
                  {diaElegido.ejercicios.map((e) => (
                    <li key={e.exerciseId}>{e.nombre}</li>
                  ))}
                </ul>
              )}

              {esCompleta ? (
                diasActuales.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Reemplaza todos los días actuales.
                  </p>
                )
              ) : (
                <Field>
                  <FieldLabel htmlFor="importar-destino">Dónde</FieldLabel>
                  <NativeSelect
                    id="importar-destino"
                    value={destino}
                    onChange={(e) => setDestino(e.target.value)}
                  >
                    {puedeAgregar && (
                      <NativeSelectOption value={AGREGAR}>
                        Agregar como día nuevo
                      </NativeSelectOption>
                    )}
                    {diasActuales.map((d) => (
                      <NativeSelectOption key={d.uid} value={d.uid}>
                        Reemplazar Día {d.numero}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
              )}
            </>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onAbiertoChange(false)}>
            Cancelar
          </Button>
          <Button type="button" variant="brand" onClick={confirmar} disabled={!puedeConfirmar}>
            Traer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
