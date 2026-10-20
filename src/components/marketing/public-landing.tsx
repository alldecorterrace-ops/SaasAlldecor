import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  Check,
  CheckCheck,
  ChevronDown,
  CircleCheck,
  ClipboardList,
  FileCheck2,
  Layers3,
  LockKeyhole,
  Mail,
  ReceiptText,
  ShieldCheck,
  UsersRound,
  Wallet,
  Workflow,
} from "lucide-react";
import {
  subscriptionPlans,
  planUsersLabel,
  planCompaniesLabel,
  planInvoicesLabel,
  planServices,
} from "@/lib/subscription-catalog";
import { ProductTour } from "./product-tour";
import styles from "./landing.module.css";

const startingPrice = (
  Math.min(...subscriptionPlans.map((plan) => plan.amount)) / 100
).toFixed(2);
const benefits = [
  {
    icon: FileCheck2,
    title: "Del primer contacto a la factura",
    description:
      "Organiza leads y clientes, prepara estimados y sigue su aprobación. Mantén conectado tu proceso comercial.",
  },
  {
    icon: Wallet,
    title: "Tus números, a la vista",
    description:
      "Consulta facturas, registra abonos y revisa gastos y costos por proyecto. Encuentra el detalle cuando lo necesitas.",
  },
  {
    icon: UsersRound,
    title: "Un equipo que sabe dónde trabajar",
    description:
      "Coordina proyectos, horas y trabajadores. Define qué puede consultar o modificar cada persona.",
  },
];
const faqs = [
  {
    question: "¿Para qué tipo de empresa está pensado All Decor?",
    answer:
      "Para empresas de servicios, instalaciones y proyectos que necesitan conectar su actividad comercial con la operación: clientes, estimados, facturas, gastos y equipo en un mismo espacio.",
  },
  {
    question: "¿Qué pasa después de contratar un plan?",
    answer:
      "Cuando se verifica el pago y confirmas tu correo, puedes crear tu primera empresa y quedas como dueño principal. Después podrás crear las empresas e invitar a las personas que permita tu plan.",
  },
  {
    question: "¿Cómo se incorporan mis empleados?",
    answer:
      "El dueño o un administrador de la empresa envía una invitación al correo del empleado y define sus permisos. El empleado crea su contraseña, confirma el correo y acepta la invitación. No obtiene permiso para crear empresas.",
  },
  {
    question: "¿Los límites se comparten entre mis empresas?",
    answer:
      "Sí. Los usuarios, las empresas y las facturas se cuentan por suscripción. Una persona ocupa una sola plaza aunque trabaje en varias empresas; las invitaciones vigentes reservan plazas. Cada empresa conserva sus propios datos y permisos.",
  },
  {
    question: "¿Cómo se cuentan las facturas mensuales?",
    answer:
      "Se cuentan al crearlas. El cupo se renueva el primer día de cada mes a las 00:00 UTC. Anular una factura no devuelve el cupo. Inicial incluye 10 y Equipo 100; Profesional y Crecimiento no tienen límite de facturas.",
  },
  {
    question: "¿Puedo cambiar de plan o cancelar?",
    answer:
      "El dueño administra la suscripción. La subida de plan se aplica cuando se confirma el cobro de la diferencia. La bajada se programa para la renovación si tus empresas y usuarios caben en el nuevo plan. La cancelación se programa al final del período pagado.",
  },
  {
    question: "¿Qué incluyen los servicios personalizados?",
    answer:
      "Crecimiento incluye la creación de un sitio web personalizado y cambios personalizados en los módulos. El alcance, las prioridades y los plazos se coordinan con nuestro equipo. También incluye atención por email y teléfono; Profesional incluye atención por email.",
  },
];

function Brand() {
  return (
    <Link href="/" className={styles.brand} aria-label="All Decor, inicio">
      <span className={styles.brandMark} aria-hidden="true">
        <Layers3 size={24} />
      </span>
      all decor<span className={styles.brandDot}>.</span>
    </Link>
  );
}
function Cta({
  href,
  children,
  secondary = false,
}: {
  href: string;
  children: React.ReactNode;
  secondary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`${styles.button} ${secondary ? styles.secondaryButton : styles.primaryButton}`}
    >
      {children}
      <ArrowUpRight size={18} aria-hidden="true" />
    </Link>
  );
}

export function PublicLanding() {
  return (
    <div className={styles.page}>
      <a href="#contenido" className={styles.skipLink}>
        Saltar al contenido
      </a>
      <header className={styles.header}>
        <nav className={styles.nav} aria-label="Navegación principal">
          <Brand />
          <div className={styles.navLinks}>
            <a href="#ventajas">Ventajas</a>
            <a href="#por-dentro">La aplicación</a>
            <a href="#planes">Planes</a>
            <a href="#preguntas">Preguntas</a>
          </div>
          <div className={styles.navActions}>
            <Link href="/login" className={styles.login}>
              Iniciar sesión
            </Link>
            <Cta href="#planes">Ver planes</Cta>
          </div>
        </nav>
      </header>
      <main id="contenido">
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={`${styles.container} ${styles.heroGrid}`}>
            <div className={styles.heroCopy}>
              <p className={styles.pill}>
                <span aria-hidden="true" />
                Un espacio para todo tu negocio
              </p>
              <h1 id="hero-title">
                Menos pendientes.
                <br />
                <span>Más negocio.</span>
              </h1>
              <p className={styles.heroLead}>
                Tus clientes, proyectos y equipo, por fin conectados. Lleva tu
                empresa del primer estimado al último pago con All Decor.
              </p>
              <div className={styles.actions}>
                <Cta href="#planes">Encuentra tu plan</Cta>
                <Cta href="#por-dentro" secondary>
                  Conoce la aplicación
                </Cta>
              </div>
              <div className={styles.heroNotes}>
                <span>
                  <Check size={16} aria-hidden="true" />
                  Desde ${startingPrice} USD/mes
                </span>
                <span>
                  <Check size={16} aria-hidden="true" />
                  Roles y permisos incluidos
                </span>
              </div>
            </div>
            <div className={styles.heroVisual}>
              <div className={styles.floatingLabel}>
                <ShieldCheck size={20} aria-hidden="true" />
                <span>
                  Tu empresa.<strong>Tú tienes el control.</strong>
                </span>
              </div>
              <figure className={styles.heroScreen}>
                <div className={styles.windowBar}>
                  <span aria-hidden="true">● ● ●</span>
                  <span>all decor / tu espacio de trabajo</span>
                  <LockKeyhole size={13} aria-hidden="true" />
                </div>
                <Image
                  src="/images/landing/estimados.jpg"
                  width={1265}
                  height={713}
                  alt="Vista real del módulo Estimados de All Decor con propuestas y sus estados, usando datos ficticios."
                  priority
                  sizes="(max-width: 1023px) 92vw, 650px"
                />
                <figcaption>
                  Una mirada por dentro · Datos de demostración
                </figcaption>
              </figure>
              <div className={styles.flowBadge}>
                <span>
                  <FileCheck2 size={18} aria-hidden="true" />
                  Estimado
                </span>
                <ArrowRight size={16} aria-hidden="true" />
                <span>
                  <ReceiptText size={18} aria-hidden="true" />
                  Factura
                </span>
                <ArrowRight size={16} aria-hidden="true" />
                <span>
                  <CircleCheck size={18} aria-hidden="true" />
                  Seguimiento
                </span>
              </div>
            </div>
          </div>
        </section>
        <div
          className={styles.moduleStrip}
          aria-label="Áreas de trabajo incluidas"
        >
          <div className={styles.container}>
            <span>
              <UsersRound />
              Clientes
            </span>
            <span>
              <FileCheck2 />
              Estimados
            </span>
            <span>
              <ReceiptText />
              Facturas
            </span>
            <span>
              <ClipboardList />
              Proyectos
            </span>
            <span>
              <Wallet />
              Gastos
            </span>
            <span>
              <Building2 />
              Tus empresas
            </span>
          </div>
        </div>

        <section
          id="ventajas"
          className={`${styles.section} ${styles.container}`}
        >
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>Menos dispersión. Más claridad.</p>
            <h2>
              Tu operación tiene muchas partes.
              <br />
              <span>Tu herramienta no tiene por qué.</span>
            </h2>
            <p>
              La información que tu equipo necesita, conectada al trabajo de
              cada día.
            </p>
          </div>
          <div className={styles.benefits}>
            {benefits.map(({ icon: Icon, title, description }, index) => (
              <article className={styles.benefit} key={title}>
                <span className={styles.iconBox}>
                  <Icon size={26} aria-hidden="true" />
                </span>
                <span className={styles.benefitNumber}>0{index + 1}</span>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
          <div className={styles.workflow}>
            <p>
              <Workflow size={20} aria-hidden="true" />
              <strong>Un proceso que se conecta.</strong>
            </p>
            <div>
              <span>Cliente</span>
              <ArrowRight aria-hidden="true" />
              <span>Estimado</span>
              <ArrowRight aria-hidden="true" />
              <span>Proyecto</span>
              <ArrowRight aria-hidden="true" />
              <span>Factura y pagos</span>
            </div>
          </div>
        </section>

        <section
          id="por-dentro"
          className={`${styles.section} ${styles.productSection}`}
        >
          <div className={styles.container}>
            <div className={styles.sectionHeading}>
              <p className={styles.eyebrow}>Así se trabaja en All Decor</p>
              <h2>
                Conoce tu próximo
                <br />
                <span>espacio de trabajo.</span>
              </h2>
              <p>
                Explora las pantallas de la aplicación. Información ordenada y
                acciones claras para avanzar.
              </p>
            </div>
            <ProductTour />
          </div>
        </section>

        <section
          className={`${styles.section} ${styles.container} ${styles.accessSection}`}
          aria-labelledby="access-title"
        >
          <div>
            <p className={styles.eyebrow}>Crece con orden</p>
            <h2 id="access-title">
              Más equipo.
              <br />
              <span>El control sigue siendo tuyo.</span>
            </h2>
            <p className={styles.bodyLead}>
              Invita por correo y asigna el acceso que necesita cada persona. Tú
              decides quién consulta, quién edita y quién administra.
            </p>
            <ul className={styles.checkList}>
              <li>
                <ShieldCheck aria-hidden="true" />
                El dueño principal está protegido.
              </li>
              <li>
                <Building2 aria-hidden="true" />
                Datos y permisos separados por empresa.
              </li>
              <li>
                <Mail aria-hidden="true" />
                Cada invitado define su propia contraseña.
              </li>
            </ul>
            <Link href="#preguntas" className={styles.textLink}>
              Conoce cómo funcionan los accesos{" "}
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
          <div className={styles.roleStack}>
            <div className={styles.ownerCard}>
              <span className={styles.roleAvatar}>
                <ShieldCheck size={27} aria-hidden="true" />
              </span>
              <div>
                <span className={styles.roleEyebrow}>DUEÑO PRINCIPAL</span>
                <h3>Tu negocio, tus decisiones.</h3>
                <p>Empresas, equipo y suscripción.</p>
              </div>
              <LockKeyhole size={18} aria-hidden="true" />
            </div>
            <div className={styles.roleConnector} aria-hidden="true" />
            <div className={styles.roleGrid}>
              <article>
                <span className={styles.iconBox}>
                  <UsersRound size={22} aria-hidden="true" />
                </span>
                <h3>Administrador</h3>
                <p>
                  Gestiona la empresa e invita al equipo. No puede quitar al
                  dueño.
                </p>
              </article>
              <article>
                <span className={styles.iconBox}>
                  <CheckCheck size={22} aria-hidden="true" />
                </span>
                <h3>Empleado</h3>
                <p>Consulta o edita según sus permisos. No crea empresas.</p>
              </article>
            </div>
            <p className={styles.roleFootnote}>
              Una persona puede trabajar en varias empresas y ocupar una sola
              plaza de tu suscripción.
            </p>
          </div>
        </section>

        <section className={styles.startSection} aria-labelledby="start-title">
          <div className={styles.container}>
            <div className={styles.sectionHeading}>
              <p className={styles.eyebrow}>Tu siguiente paso, claro</p>
              <h2 id="start-title">
                De elegir tu plan
                <br />a trabajar con tu equipo.
              </h2>
            </div>
            <ol className={styles.steps}>
              {[
                {
                  title: "Elige la capacidad",
                  text: "Compara usuarios, empresas y facturas. Contrata el plan que encaja con tu operación.",
                },
                {
                  title: "Crea tu espacio",
                  text: "Después del pago verificado, crea tu contraseña, confirma tu correo y configura tu empresa.",
                },
                {
                  title: "Invita y empieza",
                  text: "Añade a tu equipo, asigna sus permisos y empieza a organizar clientes, proyectos y documentos.",
                },
              ].map((step, index) => (
                <li key={step.title}>
                  <span className={styles.stepNumber}>0{index + 1}</span>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          id="planes"
          className={`${styles.section} ${styles.container}`}
        >
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>Un plan para cada etapa</p>
            <h2>
              Empieza donde estás.
              <br />
              <span>Crece hasta donde quieras.</span>
            </h2>
            <p>
              Todos los módulos activos incluidos. Elige la capacidad y el
              acompañamiento para tu negocio.
            </p>
            <span className={styles.billingPeriod}>
              USD · Facturación mensual
            </span>
          </div>
          <div className={styles.pricingGrid}>
            {subscriptionPlans.map((plan) => (
              <article
                key={plan.code}
                className={`${styles.priceCard} ${plan.code === "equipo" ? styles.featuredPlan : ""}`}
              >
                {plan.code === "equipo" && (
                  <span className={styles.planBadge}>
                    PARA TRABAJAR EN EQUIPO
                  </span>
                )}
                <h3>{plan.name}</h3>
                <p className={styles.planDescription}>{plan.description}</p>
                <p className={styles.price}>
                  ${(plan.amount / 100).toFixed(2)}
                  <span>/mes</span>
                </p>
                <Link
                  href={`/planes?plan=${plan.code}`}
                  className={`${styles.button} ${plan.code === "equipo" ? styles.primaryButton : styles.secondaryButton}`}
                >
                  Elegir {plan.name}
                  <ArrowUpRight size={17} aria-hidden="true" />
                </Link>
                <ul>
                  {[
                    planUsersLabel(plan.users),
                    planCompaniesLabel(plan.companies),
                    planInvoicesLabel(plan.invoices),
                    "Todos los módulos activos",
                    ...(plan.users === 1 ? [] : ["Invitaciones y permisos"]),
                    ...planServices(plan),
                  ].map((item) => (
                    <li key={item}>
                      <Check size={17} aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          <div className={styles.pricingNotes}>
            <ShieldCheck size={20} aria-hidden="true" />
            <p>
              Usuarios y facturas compartidos entre las empresas de tu
              suscripción. Las invitaciones vigentes reservan plazas. Precios
              antes de impuestos aplicables. Los servicios personalizados se
              coordinan con nuestro equipo.
            </p>
          </div>
          <Link href="/planes" className={styles.compareLink}>
            Ver la comparación completa de planes{" "}
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </section>

        <section
          id="preguntas"
          className={`${styles.section} ${styles.faqSection}`}
        >
          <div className={`${styles.container} ${styles.faqGrid}`}>
            <div>
              <p className={styles.eyebrow}>Antes de empezar</p>
              <h2>
                Buenas preguntas.
                <br />
                <span>Respuestas claras.</span>
              </h2>
              <p className={styles.bodyLead}>
                Conoce los planes, los accesos y cómo dar el primer paso.
              </p>
              <Link href="/registro" className={styles.textLink}>
                Ya recibí una invitación{" "}
                <ArrowUpRight size={18} aria-hidden="true" />
              </Link>
            </div>
            <div className={styles.faqList}>
              {faqs.map((faq) => (
                <details key={faq.question}>
                  <summary>
                    {faq.question}
                    <ChevronDown size={20} aria-hidden="true" />
                  </summary>
                  <p>{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.finalCta}>
          <div className={styles.container}>
            <p className={styles.eyebrow}>Tu negocio merece un espacio así</p>
            <h2>
              Conecta tu trabajo.
              <br />
              Dale espacio a lo que sigue.
            </h2>
            <p>
              Clientes, proyectos y personas. Todo empieza con tu primer espacio
              en All Decor.
            </p>
            <Cta href="#planes" secondary>
              Elige tu plan
            </Cta>
            <Link href="/login" className={styles.finalLogin}>
              ¿Ya tienes cuenta? Inicia sesión{" "}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>
      <footer className={styles.footer}>
        <div className={styles.container}>
          <div>
            <Brand />
            <p>
              Tu equipo, tus clientes y tus proyectos.
              <br />
              Un mismo lugar para avanzar.
            </p>
          </div>
          <nav aria-label="Enlaces del pie de página">
            <a href="#ventajas">Ventajas</a>
            <a href="#por-dentro">La aplicación</a>
            <a href="#planes">Planes</a>
            <a href="#preguntas">Preguntas frecuentes</a>
            <Link href="/login">Iniciar sesión</Link>
            <Link href="/registro">Tengo una invitación</Link>
          </nav>
        </div>
        <div className={`${styles.container} ${styles.footerBottom}`}>
          <span>
            © {new Date().getUTCFullYear()} All Decor. Todos los derechos
            reservados.
          </span>
          <span>Hecho para conectar tu negocio.</span>
        </div>
      </footer>
    </div>
  );
}
