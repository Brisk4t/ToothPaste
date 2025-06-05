import React from "react";
import {
  IconButton,
  Badge,
  Card,
  Typography,
  List,
  ListItem,
  ListItemPrefix,
  ListItemSuffix,
  Chip,
  Accordion,
  AccordionHeader,
  AccordionBody,
  Alert,
  Button,
} from "@material-tailwind/react";
import { 
  PresentationChartBarIcon,
  UserCircleIcon,
  Cog6ToothIcon,
  InboxIcon,
  PowerIcon,
} from "@heroicons/react/24/solid";
import {
  HomeIcon ,
  ChevronRightIcon,
  ClipboardIcon,
  PlayIcon,
  WifiIcon,
  ArrowPathIcon
} from "@heroicons/react/24/outline";
  
import { useBLEContext } from "../../context/BLEContext";



// Status icon for a given device
function ConnectionIcon({connected }) {
  const { connectToDevice, status } = useBLEContext();

  return (
    <div className="flex items-center justify-center w-6 h-6 ">
      {/* <Badge color={status ? "primary" : "secondary"} onClick={connectToDevice}>
      </Badge> */}
      <ArrowPathIcon className="text-text" onClick={connectToDevice} />
    </div>
  );
}

export function SidebarWithLogo() {
  const [open, setOpen] = React.useState(0);
  const [openAlert, setOpenAlert] = React.useState(true);
  const { status, device } = useBLEContext();

  const handleOpen = (value) => {
    setOpen(open === value ? 0 : value);
  };
 
  return (
    <Card className={'h-[calc(100vh)] w-full max-w-[20rem] p-4 shadow-xl bg-shelf text-text '}>
      
      <div className="mb-2 flex items-center gap-4 p-4">
        <img src="https://docs.material-tailwind.com/img/logo-ct-dark.png" alt="brand" className="h-8 w-8" />
        <Typography variant="h5" color="text">
          ClipBoard
        </Typography>
      </div>

      <List className="text-text gap-4">
        <Accordion
          open={open === 1}
          icon={
            <ConnectionIcon/>
          }
        >
          <ListItem className={`p-0 border-2 ${status ? 'border-primary' : 'border-secondary'} hover:border-white focus:border-transparent`} selected={open === 1}>
            <AccordionHeader onClick={() => handleOpen(1)} className="border-b-0 border-hover p-3">
              <Typography color="text" className="mr-auto font-normal">
                {device ? device.name : "Connect to Device"}
              </Typography>
            </AccordionHeader>
          </ListItem>
          <AccordionBody className="py-1 m-4">
            <List className="p-0 gap-4">
              <ListItem>
                Analytics
                <ListItemSuffix>
                  <ChevronRightIcon strokeWidth={3} className="h-3 w-5" />
                </ListItemSuffix>
              </ListItem>
            </List>
          </AccordionBody>
        </Accordion>
        <hr className="my-1 border-none" />
        <Typography variant="h4" className="mb-0 px-3 text-text">
          Actions
        </Typography>
        <ListItem className="ml-2">
          <ListItemPrefix>
            <ClipboardIcon className="h-5 w-5" />
          </ListItemPrefix>
          Paste
          <ListItemSuffix>
          </ListItemSuffix>
        </ListItem>
        <ListItem className="ml-2">
          <ListItemPrefix>
            <PlayIcon className="h-5 w-5" />
          </ListItemPrefix>
          Live Capture
        </ListItem>
      </List>
    </Card>
  );
}