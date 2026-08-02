"use client";

// Brief-форма (S-7, FR-1.1..1.5; DS §7). rhf + zod (дзеркало UpdateCompanyRequest +
// UpdateSettingsRequest). Поля з інтуїтивними прикладами (PR-3), inline-валідація, disabled-submit
// поки не «брудна»/валідна. На submit — дві мутації (company core + settings) паралельно.
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import {
  AGENT_MODEL_KEYS,
  AGENT_MODEL_LABELS,
  DEFAULT_MODELS_BY_PROVIDER,
  IMAGE_MODELS,
  PROVIDERS,
  PROVIDER_LABELS,
  TEXT_MODELS,
  type Provider,
} from "@forteq/shared";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Company } from "@/features/companies/use-companies";
import type { CompanySettingsDTO } from "@/lib/dto";
import { useUpdateCompany } from "@/features/companies/brief/use-update-company";
import { useUpdateSettings } from "@/features/companies/brief/use-update-settings";
import { AgentModelsSection, type AgentModelsValue } from "@/features/companies/brief/AgentModelsSection";
import {
  briefSchema,
  joinList,
  splitList,
  type BriefFormValues,
} from "@/features/companies/brief/brief-schema";

export function BriefForm({
  company,
  settings,
}: {
  company: Company;
  settings?: CompanySettingsDTO | null;
}) {
  const updateCompany = useUpdateCompany(company.id);
  const updateSettings = useUpdateSettings(company.id);

  // Ініціалізація селектора моделей із GET settings: провайдер + per-agent/visual моделі. Дефолти
  // домішуємо ПІД збережені значення, щоб форма завжди мала валідний id для кожного агента/visual
  // (навіть якщо бек ще не зберіг якийсь ключ). Далі все синхронно перезаписується при зміні провайдера.
  const initialProvider: Provider = settings?.provider ?? "openai";
  const initialModels: Record<string, string> = {
    ...DEFAULT_MODELS_BY_PROVIDER[initialProvider],
    ...(settings?.models ?? {}),
  };

  const form = useForm<BriefFormValues>({
    resolver: zodResolver(briefSchema),
    defaultValues: {
      name: company.name,
      websiteUrl: company.websiteUrl ?? "",
      description: company.description ?? "",
      positioning: company.positioning ?? "",
      audience: company.audience ?? "",
      stack: joinList(company.stack),
      services: joinList(company.services),
      toneOfVoice: settings?.toneOfVoice ?? "",
      toneExamples: joinList(settings?.toneExamples, "newline"),
      visualStyle: settings?.visualStyle ?? "",
      forbiddenPhrases: joinList(settings?.forbiddenPhrases),
      language: settings?.language ?? "uk",
      provider: initialProvider,
      models: initialModels,
      agentModels: (settings?.agentModels ?? {}) as Record<string, { provider: Provider; model: string }>,
    },
  });

  // Активний провайдер (watch → перерендер списку ТЕКСТОВИХ моделей при зміні).
  const provider: Provider = (form.watch("provider") as Provider | undefined) ?? "openai";
  const textModels = TEXT_MODELS[provider];

  // Зміна провайдера → одразу переставити ВСІ моделі на дефолти нового провайдера, інакше в
  // models[] лишились би невалідні id чужого провайдера (напр. gpt-* у Anthropic). visual завжди OpenAI.
  function handleProviderChange(next: Provider) {
    form.setValue("provider", next, { shouldDirty: true });
    form.setValue("models", { ...DEFAULT_MODELS_BY_PROVIDER[next] }, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  // «Скинути до дефолтів» — розумні per-agent дефолти поточного провайдера.
  function resetModelsToDefaults() {
    form.setValue("models", { ...DEFAULT_MODELS_BY_PROVIDER[provider] }, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  async function onSubmit(values: BriefFormValues) {
    const websiteUrl = values.websiteUrl?.trim() ? values.websiteUrl.trim() : undefined;
    try {
      await Promise.all([
        updateCompany.mutateAsync({
          name: values.name,
          positioning: values.positioning || undefined,
          audience: values.audience || undefined,
          websiteUrl,
          description: values.description || undefined,
          stack: splitList(values.stack),
          services: splitList(values.services),
        }),
        updateSettings.mutateAsync({
          toneOfVoice: values.toneOfVoice || undefined,
          toneExamples: splitList(values.toneExamples, "newline"),
          visualStyle: values.visualStyle || undefined,
          forbiddenPhrases: splitList(values.forbiddenPhrases),
          language: values.language || undefined,
          provider: values.provider,
          models: values.models,
          // порожній override → null (легасі-режим), інакше — перевизначені ролі.
          agentModels:
            values.agentModels && Object.keys(values.agentModels).length > 0
              ? values.agentModels
              : null,
        }),
      ]);
      toast.success("Бренд-профіль збережено");
      form.reset(values);
    } catch {
      // Помилки показує глобальний обробник (mutationCache.onError) — toast з ApiError.message.
    }
  }

  const pending = updateCompany.isPending || updateSettings.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* ── Компанія ── */}
        <Card>
          <CardHeader>
            <CardTitle>Компанія</CardTitle>
            <CardDescription>
              Базові дані про бізнес — саме на них спираються агенти при генерації.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Назва*</FormLabel>
                  <FormControl>
                    <Input placeholder="Forteq Systems" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="websiteUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Сайт</FormLabel>
                    <FormControl>
                      <Input placeholder="https://forteq.systems" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="audience"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Аудиторія</FormLabel>
                    <FormControl>
                      <Input placeholder="CTO та продуктові команди B2B SaaS" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="positioning"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Позиціонування</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Одним-двома реченнями: чим ви корисні й для кого."
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>Приклад: «Будуємо надійні AI-продукти під ключ для B2B».</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Короткий опис</FormLabel>
                  <FormControl>
                    <Input placeholder="Команда, що будує продукти й AI-агентів." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="stack"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Стек</FormLabel>
                    <FormControl>
                      <Input placeholder="TypeScript, Next.js, PostgreSQL" {...field} />
                    </FormControl>
                    <FormDescription>Через кому.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="services"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Послуги</FormLabel>
                    <FormControl>
                      <Input placeholder="Розробка MVP, AI-інтеграції, аудит" {...field} />
                    </FormControl>
                    <FormDescription>Через кому.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Бренд і генерація ── */}
        <Card>
          <CardHeader>
            <CardTitle>Бренд і генерація</CardTitle>
            <CardDescription>Тон, стиль і дефолти LLM для генерації контенту.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <FormField
              control={form.control}
              name="toneOfVoice"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Тон голосу</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Експертно-дружній, без жаргону та маркетингового шуму." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="toneExamples"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Приклади тону</FormLabel>
                  <FormControl>
                    <Textarea placeholder={"Ми будуємо, а не обіцяємо.\nСкладне — простими словами."} {...field} />
                  </FormControl>
                  <FormDescription>По одному прикладу на рядок.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="visualStyle"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Візуальний стиль</FormLabel>
                  <FormControl>
                    <Input placeholder="Мінімалізм, синій акцент, багато повітря" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="forbiddenPhrases"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Заборонені фрази</FormLabel>
                  <FormControl>
                    <Input placeholder="революційний, унікальна пропозиція" {...field} />
                  </FormControl>
                  <FormDescription>Через кому — їх агенти уникатимуть.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="language"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Мова контенту</FormLabel>
                    <FormControl>
                      <Input placeholder="uk" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Моделі AI ── */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1.5">
                <CardTitle>Моделі AI</CardTitle>
                <CardDescription>
                  Провайдер і моделі per-agent для пайплайна генерації. Зображення завжди генерує
                  OpenAI.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto shrink-0 p-0"
                onClick={resetModelsToDefaults}
              >
                Скинути до дефолтів
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-5">
            <FormField
              control={form.control}
              name="provider"
              render={({ field }) => (
                <FormItem className="sm:max-w-xs">
                  <FormLabel>Провайдер</FormLabel>
                  <FormControl>
                    <Select
                      value={field.value ?? "openai"}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                      onChange={(e) => handleProviderChange(e.target.value as Provider)}
                    >
                      {PROVIDERS.map((p) => (
                        <option key={p} value={p}>
                          {PROVIDER_LABELS[p]}
                        </option>
                      ))}
                    </Select>
                  </FormControl>
                  <FormDescription>
                    Зміна провайдера скидає текстові моделі на його розумні дефолти.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <p className="text-sm font-medium leading-none">Текстові моделі (per-agent)</p>
              <div className="grid gap-4 sm:grid-cols-2">
                {AGENT_MODEL_KEYS.map((agentKey) => (
                  <FormField
                    key={agentKey}
                    control={form.control}
                    name={`models.${agentKey}` as FieldPath<BriefFormValues>}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{AGENT_MODEL_LABELS[agentKey]}</FormLabel>
                        <FormControl>
                          <Select
                            value={(field.value as string | undefined) ?? ""}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                            name={field.name}
                            ref={field.ref}
                          >
                            {textModels.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.label}
                              </option>
                            ))}
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
              </div>
            </div>

            <FormField
              control={form.control}
              name="models.visual"
              render={({ field }) => (
                <FormItem className="sm:max-w-xs">
                  <FormLabel>Візуал (зображення)</FormLabel>
                  <FormControl>
                    <Select
                      value={(field.value as string | undefined) ?? IMAGE_MODELS[0].id}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                    >
                      {IMAGE_MODELS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <p className="text-sm font-medium leading-none">Модель під кожну роль (розширено)</p>
              <AgentModelsSection
                value={(form.watch("agentModels") ?? {}) as AgentModelsValue}
                onChange={(next) => form.setValue("agentModels", next, { shouldDirty: true })}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending || !form.formState.isDirty}>
            {pending ? "Зберігаємо…" : "Зберегти"}
          </Button>
          {form.formState.isDirty && (
            <span className="text-sm text-muted-foreground">Є незбережені зміни</span>
          )}
        </div>
      </form>
    </Form>
  );
}
