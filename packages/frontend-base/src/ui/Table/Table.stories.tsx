import type { Story, StoryDefault } from "@ladle/react";

import { Avatar } from "../Avatar";
import { Link } from "../Link";
import { Text } from "../Text/Text";
import { Table, type TableColumn } from "./";

export default {
  title: "ui/table/table",
} satisfies StoryDefault;

type MyData = {
  id: string;
  name: string;
  phone: string;
  lastAppointmentDate: string;
  actions: React.ReactNode;
  photo: string;
};

const data: MyData[] = new Array(5).fill("").map((_, index) => ({
  id: index.toString(),
  name: "Jane Doe",
  phone: "5511999999999",
  lastAppointmentDate: `0${index + 1}-04-2023`,
  actions: <Link.Button href="#">Detalhes</Link.Button>,
  photo: "https://cdn.quasar.dev/img/avatar.png",
}));

const columns: TableColumn<MyData>[] = [
  {
    title: "Dados do paciente",
    property: "name",
    render: (item) => (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flexDirection: "row",
          columnGap: "12px",
        }}
      >
        <Avatar src={item.photo} fallback="JD" />
        <Text>{item.name}</Text>
      </div>
    ),
  },
  {
    title: "Contato",
    property: "phone",
  },
  {
    title: "Última consulta",
    property: "lastAppointmentDate",
  },
  {
    title: "Ações",
    property: "actions",
  },
];

const footerData = [
  "Detalhes pessoais",
  "Informações de contato",
  "Dados de agendamento",
  "CTAs",
];

export const Default: Story = () => <Table columns={columns} data={data} />;

export const Loading: Story = () => (
  <Table columns={columns} data={data} isLoading />
);

export const WithZebraStripes: Story = () => (
  <Table columns={columns} data={data} zebra />
);

export const WithTableFooter: Story = () => (
  <Table columns={columns} data={data} footerData={footerData} />
);

export const NoResult: Story = () => (
  <Table columns={columns} data={[]} footerData={footerData} />
);

export const WithPagination: Story = () => (
  <div>
    <Table columns={columns} data={data} footerData={footerData} />
    <Table.Pagination
      currentPage={0}
      take={5}
      totalPages={10}
      totalResults={100}
      onClickNext={() => {}}
      onClickPage={() => {}}
      onClickPrevious={() => {}}
    />
  </div>
);
